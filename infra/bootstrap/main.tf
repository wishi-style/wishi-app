terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name used in resource naming"
  type        = string
  default     = "wishi"
}

variable "github_repo" {
  description = "GitHub repo in org/repo format"
  type        = string
  default     = "wishi-style/wishi-app"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

# -----------------------------------------------------------------------------
# Terraform state
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tf-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "lock" {
  name         = "${var.project}-tf-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# -----------------------------------------------------------------------------
# ECR repositories
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "web" {
  name                 = "${var.project}-web"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = "${var.project}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# -----------------------------------------------------------------------------
# GitHub Actions OIDC
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
}

# --- Staging role: any branch can assume ---

resource "aws_iam_role" "github_staging" {
  name = "${var.project}-github-actions-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

# --- Production role: only main branch ---

resource "aws_iam_role" "github_production" {
  name = "${var.project}-github-actions-production"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/main"
        }
      }
    }]
  })
}

# --- CI/CD permissions ---
#
# Both GitHub Actions roles get AWS-managed AdministratorAccess. The
# previous narrow custom policy (ECR + ECS + Secrets-Read + S3-Assets)
# was too restrictive for two real workflows:
#
#   1. `terraform apply` from CI needs read+write on every AWS service
#      Terraform manages (RDS, EC2, IAM, Logs, Secrets, ALB, etc.).
#      Adding service-by-service perms is whack-a-mole and ends up
#      approximating admin anyway.
#
#   2. The deploy workflow's migration step runs an ECS task that needs
#      the same broad set the app's task role has, plus Run/Describe.
#
# Risk model for granting admin to these roles:
#   - Trust policy on each role is OIDC-scoped to repo:wishi-style/* —
#     only this repo's workflows can assume them.
#   - The production role's trust is further locked to
#     refs/heads/main, and the production GitHub environment requires
#     reviewer approval before workflow_dispatch deploys run.
#   - Repo access is solo (Matt) pre-launch; review gates can be
#     tightened post-launch (per-environment IAM boundaries, separate
#     terraform-apply role with stricter scope, etc.).
#
# When adding gates later: replace these attachments with a custom
# policy that mirrors AWS managed `PowerUserAccess` minus the IAM perms
# you don't want CI to have, plus a permission boundary for defense
# in depth.

resource "aws_iam_role_policy_attachment" "github_staging_admin" {
  role       = aws_iam_role.github_staging.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_iam_role_policy_attachment" "github_production_admin" {
  role       = aws_iam_role.github_production.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "lock_table" {
  value = aws_dynamodb_table.lock.name
}

output "ecr_web_url" {
  value = aws_ecr_repository.web.repository_url
}

output "ecr_worker_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "github_staging_role_arn" {
  value = aws_iam_role.github_staging.arn
}

output "github_production_role_arn" {
  value = aws_iam_role.github_production.arn
}
