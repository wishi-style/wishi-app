terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.env
      ManagedBy   = "terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# Network
# -----------------------------------------------------------------------------

module "network" {
  source            = "./modules/network"
  project           = var.project
  env               = var.env
  vpc_cidr          = var.vpc_cidr
  nat_gateway_count = var.nat_gateway_count
}

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

module "database" {
  source             = "./modules/database"
  project            = var.project
  env                = var.env
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  ecs_task_sg_id     = module.network.ecs_task_sg_id
  instance_class     = var.db_instance_class
  allocated_storage  = var.db_allocated_storage
  multi_az           = var.db_multi_az
}

# -----------------------------------------------------------------------------
# Storage
# -----------------------------------------------------------------------------

module "storage" {
  source  = "./modules/storage"
  project = var.project
  env     = var.env
}

# -----------------------------------------------------------------------------
# Secrets
# -----------------------------------------------------------------------------

module "secrets" {
  source  = "./modules/secrets"
  project = var.project
  env     = var.env
}

# -----------------------------------------------------------------------------
# Log group (created before service so it can be referenced)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project}-${var.env}-web"
  retention_in_days = var.log_retention_days
}

# -----------------------------------------------------------------------------
# Service (ECS Fargate + ALB)
# -----------------------------------------------------------------------------

module "service" {
  source                               = "./modules/service"
  project                              = var.project
  env                                  = var.env
  vpc_id                               = module.network.vpc_id
  public_subnet_ids                    = module.network.public_subnet_ids
  private_subnet_ids                   = module.network.private_subnet_ids
  ecs_task_sg_id                       = module.network.ecs_task_sg_id
  db_url_secret_arn                    = module.database.db_url_secret_arn
  db_direct_url_secret_arn             = module.database.db_direct_url_secret_arn
  clerk_secret_key_arn                 = module.secrets.secret_arns["clerk/secret_key"]
  clerk_webhook_secret_arn             = module.secrets.secret_arns["clerk/webhook_secret"]
  stripe_secret_key_arn                = module.secrets.secret_arns["stripe/secret_key"]
  stripe_webhook_secret_arn            = module.secrets.secret_arns["stripe/webhook_secret"]
  twilio_account_sid_arn               = module.secrets.secret_arns["twilio/account_sid"]
  twilio_auth_token_arn                = module.secrets.secret_arns["twilio/auth_token"]
  twilio_api_key_sid_arn               = module.secrets.secret_arns["twilio/api_key_sid"]
  twilio_api_key_secret_arn            = module.secrets.secret_arns["twilio/api_key_secret"]
  twilio_conversations_service_sid_arn = module.secrets.secret_arns["twilio/conversations_service_sid"]
  vapid_public_key_arn                 = module.secrets.secret_arns["web_push/vapid_public_key"]
  vapid_private_key_arn                = module.secrets.secret_arns["web_push/vapid_private_key"]
  klaviyo_api_key_arn                  = module.secrets.secret_arns["klaviyo/api_key"]
  easypost_api_key_arn                 = module.secrets.secret_arns["easypost/api_key"]
  easypost_webhook_secret_arn          = module.secrets.secret_arns["easypost/webhook_secret"]
  worker_secret_arn                    = module.secrets.secret_arns["app/worker_secret"]
  ecr_web_url                          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.project}-web"
  cpu                                  = var.ecs_cpu
  memory                               = var.ecs_memory
  desired_count                        = var.ecs_desired_count
  min_count                            = var.ecs_min_count
  max_count                            = var.ecs_max_count
  log_group_name                       = aws_cloudwatch_log_group.web.name
  enable_demo_mode                     = var.enable_demo_mode
  app_url                              = var.app_url
  inventory_service_url                = var.inventory_service_url
}

# -----------------------------------------------------------------------------
# Observability (alarms, SNS — depends on service)
# -----------------------------------------------------------------------------

module "observability" {
  source             = "./modules/observability"
  project            = var.project
  env                = var.env
  log_retention_days = var.log_retention_days
  cluster_name       = module.service.cluster_name
  service_name       = module.service.service_name
  alb_arn            = module.service.alb_arn
  rds_identifier     = "wishi-${var.env}-db"
}

# -----------------------------------------------------------------------------
# Workers (Phase 5: scheduled background jobs on shared ECS cluster)
# -----------------------------------------------------------------------------

module "workers" {
  source = "./modules/workers"

  project = var.project
  env     = var.env

  cluster_arn = "arn:aws:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:cluster/${module.service.cluster_name}"

  private_subnet_ids = module.network.private_subnet_ids
  ecs_task_sg_id     = module.network.ecs_task_sg_id

  db_url_secret_arn        = module.database.db_url_secret_arn
  db_direct_url_secret_arn = module.database.db_direct_url_secret_arn
  anthropic_api_key_arn    = try(module.secrets.secret_arns["anthropic/api_key"], "")
  vapid_public_key_arn     = module.secrets.secret_arns["web_push/vapid_public_key"]
  vapid_private_key_arn    = module.secrets.secret_arns["web_push/vapid_private_key"]

  ecr_worker_url        = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.project}-worker"
  inventory_service_url = var.inventory_service_url
  app_url               = var.app_url
  log_group_name        = module.observability.workers_log_group_name
  enable_demo_mode      = var.enable_demo_mode
}

# -----------------------------------------------------------------------------
# Scheduler (EventBridge API-destination workers for Phase 6: waitlist-notify,
# payout-reconcile). These hit the web app over HTTPS with a shared secret —
# distinct from the ECS-task-based Phase 5 workers module above.
#
# Gated on an https:// app_url. Staging currently has an http:// ALB DNS
# because wishi.me is still on the legacy AWS account; until that moves and
# we get an ACM cert wired, the scheduler skips on staging. During UAT,
# fire the workers manually via POST /api/admin/workers/[name]/run instead.
# TODO: remove this gate once staging.wishi.me HTTPS is live.
# -----------------------------------------------------------------------------

module "scheduler" {
  count  = startswith(var.app_url, "https://") ? 1 : 0
  source = "./modules/scheduler"

  project           = var.project
  env               = var.env
  app_url           = var.app_url
  worker_secret_arn = module.secrets.secret_arns["app/worker_secret"]
}

data "aws_caller_identity" "current" {}
