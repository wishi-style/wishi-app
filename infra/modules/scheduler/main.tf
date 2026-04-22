// EventBridge Scheduler module for Wishi internal workers.
//
// Three schedules:
//   - waitlist-notify        — hourly
//   - payout-reconcile       — Mondays 06:00 UTC
//   - loyalty-recalc         — 1st of month 00:00 UTC
//
// Each schedule fires an HTTPS API destination pointing at the ALB-backed
// /api/workers/<name> endpoint, signed with `x-worker-secret` from
// Secrets Manager (wishi/<env>/app/worker_secret).

variable "project" { type = string }
variable "env" { type = string }
variable "app_url" {
  type        = string
  description = "Base URL where /api/workers/* lives (e.g. https://app.example.com)"
}
variable "worker_secret_arn" {
  type        = string
  description = "ARN of the wishi/<env>/app/worker_secret Secrets Manager secret"
}

locals {
  name_prefix = "${var.project}-${var.env}"
}

# EventBridge API destinations require HTTPS — http:// invocation endpoints
# are silently rejected at invocation time and also leak the worker shared
# secret in plaintext. Fail fast in plan.
resource "terraform_data" "require_https_app_url" {
  lifecycle {
    precondition {
      condition = (
        length(var.app_url) > 0 &&
        substr(var.app_url, 0, 8) == "https://"
      )
      error_message = "scheduler module: app_url must be a non-empty https:// URL. Got: \"${var.app_url}\". EventBridge API destinations only accept HTTPS, and the worker shared secret travels in a request header so HTTP would also leak it in plaintext."
    }
  }
}

# Pull the shared secret out of Secrets Manager at plan time so the
# EventBridge connection gets the real value. The secret is managed in
# wishi/<env>/app/worker_secret (modules/secrets); rotating it there flows
# through this data source into the connection on the next apply.
#
# Tradeoff: the secret's current value ends up in Terraform state. Matt's
# backend is the private infra-state S3 bucket with SSE + restricted IAM, so
# this is acceptable. If that ever changes, switch to AWS Secrets Manager
# automatic rotation and keep the connection populated via the CLI.
data "aws_secretsmanager_secret_version" "worker_secret" {
  secret_id = var.worker_secret_arn
}

# ── Connection (holds the API key / shared-secret header) ─────────────────
resource "aws_cloudwatch_event_connection" "workers" {
  name               = "${local.name_prefix}-workers"
  description        = "Wishi internal worker auth — x-worker-secret header"
  authorization_type = "API_KEY"
  auth_parameters {
    api_key {
      key   = "x-worker-secret"
      value = data.aws_secretsmanager_secret_version.worker_secret.secret_string
    }
  }
}

# ── API destinations ───────────────────────────────────────────────────────
resource "aws_cloudwatch_event_api_destination" "waitlist_notify" {
  name                             = "${local.name_prefix}-waitlist-notify"
  invocation_endpoint              = "${var.app_url}/api/workers/waitlist-notify"
  http_method                      = "POST"
  connection_arn                   = aws_cloudwatch_event_connection.workers.arn
  invocation_rate_limit_per_second = 10
}

resource "aws_cloudwatch_event_api_destination" "payout_reconcile" {
  name                             = "${local.name_prefix}-payout-reconcile"
  invocation_endpoint              = "${var.app_url}/api/workers/payout-reconcile"
  http_method                      = "POST"
  connection_arn                   = aws_cloudwatch_event_connection.workers.arn
  invocation_rate_limit_per_second = 10
}

resource "aws_cloudwatch_event_api_destination" "loyalty_recalc" {
  name                             = "${local.name_prefix}-loyalty-recalc"
  invocation_endpoint              = "${var.app_url}/api/workers/loyalty-recalc"
  http_method                      = "POST"
  connection_arn                   = aws_cloudwatch_event_connection.workers.arn
  invocation_rate_limit_per_second = 10
}

# ── IAM role for Scheduler → EventBridge API destination ───────────────────
resource "aws_iam_role" "scheduler" {
  name = "${local.name_prefix}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "${local.name_prefix}-scheduler-policy"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["events:InvokeApiDestination"]
        Resource = [
          aws_cloudwatch_event_api_destination.waitlist_notify.arn,
          aws_cloudwatch_event_api_destination.payout_reconcile.arn,
          aws_cloudwatch_event_api_destination.loyalty_recalc.arn,
        ]
      },
      # Scheduler does not need secretsmanager:GetSecretValue at invocation
      # time — the x-worker-secret header value is stored inside the
      # aws_cloudwatch_event_connection (populated via Terraform from the
      # wishi/<env>/app/worker_secret data source). Secrets Manager is only
      # touched at apply time.
    ]
  })
}

# ── Schedules ──────────────────────────────────────────────────────────────
resource "aws_scheduler_schedule" "waitlist_notify" {
  name       = "${local.name_prefix}-waitlist-notify"
  group_name = "default"

  # Hourly.
  schedule_expression          = "rate(1 hour)"
  schedule_expression_timezone = "UTC"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_cloudwatch_event_api_destination.waitlist_notify.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

resource "aws_scheduler_schedule" "payout_reconcile" {
  name       = "${local.name_prefix}-payout-reconcile"
  group_name = "default"

  # Mondays 06:00 UTC.
  schedule_expression          = "cron(0 6 ? * MON *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_cloudwatch_event_api_destination.payout_reconcile.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

resource "aws_scheduler_schedule" "loyalty_recalc" {
  name       = "${local.name_prefix}-loyalty-recalc"
  group_name = "default"

  # 1st of each month at 00:00 UTC. Defensive recompute for loyalty tiers
  # and stylist averageRating — the synchronous hooks keep these correct
  # in real time; this worker catches drift.
  schedule_expression          = "cron(0 0 1 * ? *)"
  schedule_expression_timezone = "UTC"

  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_cloudwatch_event_api_destination.loyalty_recalc.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}

output "scheduler_role_arn" { value = aws_iam_role.scheduler.arn }
