variable "project" { type = string }
variable "env" { type = string }
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "alb_arn" { type = string }
variable "rds_identifier" { type = string }
variable "web_log_group_name" { type = string }
variable "alert_email_recipients" {
  type    = list(string)
  default = []
}

locals {
  name = "${var.project}-${var.env}"
}

data "aws_region" "current" {}

# -----------------------------------------------------------------------------
# Workers log group (web log group is in root main.tf)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/ecs/${local.name}-workers"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name}-workers-logs" }
}

# -----------------------------------------------------------------------------
# SNS topic for alarms
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"

  tags = { Name = "${local.name}-alerts" }
}

# -----------------------------------------------------------------------------
# Alarms
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_ELB_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "ALB 5xx errors > 10 in 5 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = replace(var.alb_arn, "/^.*:loadbalancer\\//", "")
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_unhealthy" {
  alarm_name          = "${local.name}-ecs-unhealthy"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "No running ECS tasks"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }
}

# -----------------------------------------------------------------------------
# Email subscriptions to the alerts SNS topic. Each address has to confirm
# the subscription via the email Amazon sends after `terraform apply`.
# -----------------------------------------------------------------------------

resource "aws_sns_topic_subscription" "alerts_email" {
  for_each  = toset(var.alert_email_recipients)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# -----------------------------------------------------------------------------
# Application-error metric filters. Each filter watches the web log group for
# a specific failure signature and increments a custom metric. The companion
# alarm pages on `Sum > 0` over a 5-minute window so any production failure
# during the migration ramp surfaces immediately.
#
# Patterns mirror the literal `console.error(...)` strings already in code:
#   - reconcile_failed: post-signin / requireRole / requireAdmin self-heal
#     hit an exception. User can authenticate but their DB row didn't sync.
#   - clerk_webhook_error: signature verification or handler exception in
#     /api/webhooks/clerk. Clerk will auto-retry, but persistent ones mean
#     a misconfigured secret or a DB failure on every event.
#   - stripe_webhook_error: payment event signature verification failed,
#     or a handler threw. Either is a payment-flow blocker.
#   - twilio_invalid_signature: chat webhook delivery from Twilio is being
#     rejected. Real chat messages won't be persisted.
#   - email_collision: a Clerk user's email already exists in the DB under
#     a different clerkId. The user can authenticate but every authed page
#     will forbid them. Tagged in reconcile-clerk-user.ts.
# -----------------------------------------------------------------------------

locals {
  app_error_filters = {
    reconcile_failed = {
      pattern     = "\"reconcile failed\""
      description = "post-signin / requireRole / requireAdmin reconcile threw — user can auth but DB row didn't sync"
    }
    clerk_webhook_error = {
      pattern     = "\"[clerk webhook]\" \"error\""
      description = "Clerk webhook handler returned 400 — Clerk will retry but persistent failures break user creation"
    }
    stripe_webhook_error = {
      pattern     = "\"[stripe webhook]\""
      description = "Stripe webhook signature verification or handler error — payment flow blocked"
    }
    twilio_invalid_signature = {
      pattern     = "\"[twilio-webhook] Invalid signature\""
      description = "Twilio webhook signature mismatch — chat messages not being persisted"
    }
    email_collision = {
      pattern     = "\"email_collision\""
      description = "Clerk user email already exists in DB under different clerkId — user will be locked out"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  for_each       = local.app_error_filters
  name           = "${local.name}-${replace(each.key, "_", "-")}"
  log_group_name = var.web_log_group_name
  pattern        = each.value.pattern

  metric_transformation {
    name          = "${local.name}-${replace(each.key, "_", "-")}-count"
    namespace     = "Wishi/AppErrors"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  for_each            = local.app_error_filters
  alarm_name          = "${local.name}-${replace(each.key, "_", "-")}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "${local.name}-${replace(each.key, "_", "-")}-count"
  namespace           = "Wishi/AppErrors"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = each.value.description
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "workers_log_group_name" { value = aws_cloudwatch_log_group.workers.name }
output "sns_topic_arn" { value = aws_sns_topic.alerts.arn }
