// EventBridge Scheduler module for Wishi internal workers.
//
// Two schedules:
//   - waitlist-notify        — hourly
//   - payout-reconcile       — Mondays 06:00 UTC
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

# ── Connection (holds the API key / shared-secret header) ─────────────────
resource "aws_cloudwatch_event_connection" "workers" {
  name               = "${local.name_prefix}-workers"
  description        = "Wishi internal worker auth — x-worker-secret header"
  authorization_type = "API_KEY"
  auth_parameters {
    api_key {
      key   = "x-worker-secret"
      value = "PLACEHOLDER_ROTATED_BY_SECRETS_MANAGER"
    }
  }
  lifecycle {
    # The secret value is managed out-of-band — don't let TF reset it on every
    # apply. Operators rotate the header value via aws_cloudwatch_event_connection
    # console or a one-off CLI call after pulling from Secrets Manager.
    ignore_changes = [auth_parameters]
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
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.worker_secret_arn]
      },
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

output "scheduler_role_arn" { value = aws_iam_role.scheduler.arn }
