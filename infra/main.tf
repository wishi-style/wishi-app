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
  source               = "./modules/service"
  project              = var.project
  env                  = var.env
  vpc_id               = module.network.vpc_id
  public_subnet_ids    = module.network.public_subnet_ids
  private_subnet_ids   = module.network.private_subnet_ids
  ecs_task_sg_id       = module.network.ecs_task_sg_id
  db_url_secret_arn    = module.database.db_url_secret_arn
  db_direct_url_secret_arn = module.database.db_direct_url_secret_arn
  ecr_web_url          = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.project}-web"
  cpu                  = var.ecs_cpu
  memory               = var.ecs_memory
  desired_count        = var.ecs_desired_count
  min_count            = var.ecs_min_count
  max_count            = var.ecs_max_count
  log_group_name       = aws_cloudwatch_log_group.web.name
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

data "aws_caller_identity" "current" {}
