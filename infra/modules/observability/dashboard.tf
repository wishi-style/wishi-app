# -----------------------------------------------------------------------------
# Phase 11 launch-readiness dashboard
#
# One dashboard per environment. Widget layout reads left-to-right, top-to-
# bottom like an on-call eye-scan: traffic & errors → latency → compute →
# database → workers. Every widget is a single-metric or side-by-side pair
# so a cold reader can scan for "red" without parsing legends.
#
# Update cadence: tweak thresholds here, apply, reload the dashboard URL —
# no code deploy. Dashboard JSON lives inline so it's reviewable in diffs.
# -----------------------------------------------------------------------------

locals {
  alb_dim_value = replace(var.alb_arn, "/^.*:loadbalancer\\//", "")
  region        = data.aws_region.current.region
}

resource "aws_cloudwatch_dashboard" "launch" {
  dashboard_name = "${local.name}-launch"
  dashboard_body = jsonencode({
    widgets = [
      # Row 1 — traffic + error rate
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "ALB request rate"
          region  = local.region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb_dim_value, { stat = "Sum", label = "Requests / 1m" }],
            [".", "HTTPCode_Target_2XX_Count", ".", ".", { stat = "Sum", label = "2xx" }],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", { stat = "Sum", label = "4xx" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { stat = "Sum", label = "5xx" }],
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB 5xx error ratio (%)"
          region = local.region
          view   = "timeSeries"
          metrics = [
            [
              {
                expression = "(m2/m1)*100"
                label      = "5xx ratio"
                id         = "e1"
              }
            ],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb_dim_value, { id = "m1", visible = false, stat = "Sum" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { id = "m2", visible = false, stat = "Sum" }],
          ]
          annotations = {
            horizontal = [{ value = 1, label = "1% alarm" }]
          }
          period = 60
        }
      },

      # Row 2 — latency distribution
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 24
        height = 6
        properties = {
          title  = "ALB target response time (p50 / p95 / p99)"
          region = local.region
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_dim_value, { stat = "p50", label = "p50" }],
            ["...", { stat = "p95", label = "p95" }],
            ["...", { stat = "p99", label = "p99" }],
          ]
          annotations = {
            horizontal = [
              { value = 1, label = "p99 cached target (1s)" },
              { value = 3, label = "p99 dynamic target (3s)" },
            ]
          }
          period = 60
        }
      },

      # Row 3 — ECS compute
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "ECS web — CPU & memory utilization"
          region = local.region
          view   = "timeSeries"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.cluster_name, "ServiceName", var.service_name, { label = "CPU %" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { label = "Memory %" }],
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "ECS running task count"
          region = local.region
          view   = "timeSeries"
          metrics = [
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.cluster_name, "ServiceName", var.service_name, { stat = "Average" }],
            ["AWS/ECS", "DesiredCount", ".", ".", ".", ".", { stat = "Average" }],
          ]
          period = 60
        }
      },

      # Row 4 — RDS
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "RDS CPU utilization"
          region = local.region
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_identifier],
          ]
          annotations = {
            horizontal = [{ value = 70, label = "Alarm @ 70%" }]
          }
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "RDS DB connections"
          region = local.region
          view   = "timeSeries"
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_identifier],
          ]
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "RDS free storage (GB)"
          region = local.region
          view   = "timeSeries"
          metrics = [
            [
              { expression = "m1/1024/1024/1024", label = "Free GB", id = "e1" }
            ],
            ["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.rds_identifier, { id = "m1", visible = false }],
          ]
          period = 300
        }
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Phase 11 alarms — add to the existing ALB + ECS-unhealthy alarms already
# defined in main.tf. Tuned for production baseline; adjust thresholds via
# staging load test data before cutover.
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx_ratio" {
  alarm_name          = "${local.name}-alb-5xx-ratio"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 1 # percent
  alarm_description   = "ALB 5xx ratio > 1% sustained for 2 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "e1"
    expression  = "(m2/m1)*100"
    label       = "5xx ratio"
    return_data = true
  }

  metric_query {
    id = "m1"
    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 60
      stat        = "Sum"
      dimensions = {
        LoadBalancer = local.alb_dim_value
      }
    }
  }

  metric_query {
    id = "m2"
    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 60
      stat        = "Sum"
      dimensions = {
        LoadBalancer = local.alb_dim_value
      }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_p99" {
  alarm_name          = "${local.name}-alb-target-p99-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p99"
  threshold           = 3
  alarm_description   = "ALB target p99 latency > 3s for 3 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = local.alb_dim_value
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  threshold           = 70
  alarm_description   = "RDS CPU > 70% for 3 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.name}-rds-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5368709120 # 5 GiB
  alarm_description   = "RDS free storage < 5 GiB"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = var.rds_identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "${local.name}-ecs-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "ECS web service CPU > 80% for 3 minutes (consider scaling)"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = var.cluster_name
    ServiceName = var.service_name
  }
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL — pin in the runbook"
  value       = "https://${local.region}.console.aws.amazon.com/cloudwatch/home?region=${local.region}#dashboards:name=${aws_cloudwatch_dashboard.launch.dashboard_name}"
}
