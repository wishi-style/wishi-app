variable "project" { type = string }
variable "env" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "ecs_task_sg_id" { type = string }
variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "allocated_storage" {
  type    = number
  default = 20
}
variable "multi_az" {
  type    = bool
  default = false
}

locals {
  name = "${var.project}-${var.env}"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# -----------------------------------------------------------------------------
# Random password
# -----------------------------------------------------------------------------

resource "random_password" "db" {
  length  = 32
  special = false
}

# -----------------------------------------------------------------------------
# Subnet group
# -----------------------------------------------------------------------------

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${local.name}-db-subnet-group" }
}

# -----------------------------------------------------------------------------
# Security groups
# -----------------------------------------------------------------------------

resource "aws_security_group" "rds_proxy" {
  name_prefix = "${local.name}-rds-proxy-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_task_sg_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-rds-proxy-sg" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.rds_proxy.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name}-rds-sg" }
}

# -----------------------------------------------------------------------------
# Parameter group
# -----------------------------------------------------------------------------

resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.name}-pg16-"
  family      = "postgres16"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = { Name = "${local.name}-pg16" }

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# RDS instance
# -----------------------------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier     = "${local.name}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.instance_class

  allocated_storage = var.allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "wishi"
  username = "wishi"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  multi_az            = var.multi_az
  publicly_accessible = false

  backup_retention_period = 7
  skip_final_snapshot     = var.env == "staging"
  deletion_protection     = var.env == "production"

  tags = { Name = "${local.name}-db" }
}

# -----------------------------------------------------------------------------
# Secrets Manager — DB credentials (for RDS Proxy auth)
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${var.project}/${var.env}/database/credentials"

  tags = { Name = "${local.name}-db-credentials" }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db.result
  })
}

# -----------------------------------------------------------------------------
# Secrets Manager — connection URLs (consumed by the app)
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_url" {
  name = "${var.project}/${var.env}/database/url"

  tags = { Name = "${local.name}-db-url" }
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id     = aws_secretsmanager_secret.db_url.id
  secret_string = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_proxy.main.endpoint}:5432/wishi?sslmode=require"
}

resource "aws_secretsmanager_secret" "db_direct_url" {
  name = "${var.project}/${var.env}/database/direct_url"

  tags = { Name = "${local.name}-db-direct-url" }
}

resource "aws_secretsmanager_secret_version" "db_direct_url" {
  secret_id     = aws_secretsmanager_secret.db_direct_url.id
  secret_string = "postgresql://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/wishi?sslmode=require"
}

# -----------------------------------------------------------------------------
# RDS Proxy
# -----------------------------------------------------------------------------

resource "aws_iam_role" "rds_proxy" {
  name = "${local.name}-rds-proxy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "rds.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  name = "secrets-access"
  role = aws_iam_role.rds_proxy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = aws_secretsmanager_secret.db_credentials.arn
    }]
  })
}

resource "aws_db_proxy" "main" {
  name                   = "${local.name}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_subnet_ids         = var.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]
  require_tls            = false
  idle_client_timeout    = 1800

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials.arn
  }

  tags = { Name = "${local.name}-proxy" }

  depends_on = [aws_secretsmanager_secret_version.db_credentials]
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name

  connection_pool_config {
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

resource "aws_db_proxy_target" "main" {
  db_proxy_name          = aws_db_proxy.main.name
  target_group_name      = aws_db_proxy_default_target_group.main.name
  db_instance_identifier = aws_db_instance.main.identifier
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "rds_endpoint" { value = aws_db_instance.main.endpoint }
output "rds_proxy_endpoint" { value = aws_db_proxy.main.endpoint }
output "db_url_secret_arn" { value = aws_secretsmanager_secret.db_url.arn }
output "db_direct_url_secret_arn" { value = aws_secretsmanager_secret.db_direct_url.arn }
output "rds_proxy_sg_id" { value = aws_security_group.rds_proxy.id }
