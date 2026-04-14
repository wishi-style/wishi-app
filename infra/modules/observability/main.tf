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
# Outputs
# -----------------------------------------------------------------------------

output "workers_log_group_name" { value = aws_cloudwatch_log_group.workers.name }
output "sns_topic_arn" { value = aws_sns_topic.alerts.arn }
