locals {
  name = "${var.project}-${var.env}"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# -----------------------------------------------------------------------------
# Task roles
# -----------------------------------------------------------------------------

resource "aws_iam_role" "task_execution" {
  name = "${local.name}-workers-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_base" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Let the execution role pull secrets referenced in the task definition.
resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "${local.name}-workers-exec-secrets"
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = compact([
        var.db_url_secret_arn,
        var.db_direct_url_secret_arn,
        var.anthropic_api_key_arn,
        var.vapid_public_key_arn,
        var.vapid_private_key_arn,
      ])
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-workers-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Worker tasks need to put objects into the uploads bucket (closet scraper).
resource "aws_iam_role_policy" "task_s3" {
  name = "${local.name}-workers-s3"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:GetObject"]
      Resource = "arn:aws:s3:::${var.project}-uploads-${var.env}/*"
    }]
  })
}

# -----------------------------------------------------------------------------
# Task definition (shared across all worker schedules; WORKER env var selects)
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "workers" {
  family                   = "${local.name}-workers"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${var.ecr_worker_url}:latest"
    essential = true

    environment = concat(
      [
        { name = "NODE_ENV", value = "production" },
        { name = "S3_UPLOADS_BUCKET", value = "${var.project}-uploads-${var.env}" },
        { name = "AWS_REGION", value = data.aws_region.current.name },
        { name = "INVENTORY_SERVICE_URL", value = var.inventory_service_url },
        { name = "APP_URL", value = var.app_url },
        { name = "DEPLOYED_ENV", value = var.env },
        # WORKER is overridden per-schedule via containerOverrides in the
        # EventBridge scheduler target (see schedules below).
      ],
      var.enable_demo_mode ? [
        { name = "E2E_AUTH_MODE", value = "true" },
      ] : []
    )

    secrets = [
      { name = "DATABASE_URL", valueFrom = var.db_url_secret_arn },
      { name = "DIRECT_DATABASE_URL", valueFrom = var.db_direct_url_secret_arn },
      { name = "VAPID_PUBLIC_KEY", valueFrom = var.vapid_public_key_arn },
      { name = "VAPID_PRIVATE_KEY", valueFrom = var.vapid_private_key_arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.log_group_name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

# -----------------------------------------------------------------------------
# Scheduler role (EventBridge Scheduler → RunTask)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "scheduler" {
  name = "${local.name}-workers-scheduler"
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
  name = "${local.name}-workers-scheduler"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = "${replace(aws_ecs_task_definition.workers.arn, ":${aws_ecs_task_definition.workers.revision}", ":*")}"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [aws_iam_role.task.arn, aws_iam_role.task_execution.arn]
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Schedules (one per worker)
# -----------------------------------------------------------------------------

locals {
  # Worker name → schedule expression. All times UTC. rate() requires hour
  # granularity; cron() lets us anchor specific times-of-day.
  base_schedules = {
    "affiliate-ingest"      = "cron(0 5 * * ? *)" # daily 05:00 UTC
    "affiliate-prompt"      = "rate(15 minutes)"
    "pending-action-expiry" = "rate(15 minutes)"
    "stale-cleanup"         = "cron(0 3 * * ? *)" # daily 03:00 UTC
  }

  demo_schedules = var.enable_demo_mode ? {
    # Runs after stale-cleanup so demo-reset wipes sessions/boards/messages
    # from the prior day right before founders show up in the morning.
    "demo-reset" = "cron(0 4 * * ? *)" # daily 04:00 UTC
  } : {}

  schedules = merge(local.base_schedules, local.demo_schedules)
}

resource "aws_scheduler_schedule" "worker" {
  for_each = local.schedules

  name                = "${local.name}-${each.key}"
  schedule_expression = each.value
  flexible_time_window { mode = "OFF" }

  target {
    arn      = var.cluster_arn
    role_arn = aws_iam_role.scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.workers.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = var.private_subnet_ids
        security_groups  = [var.ecs_task_sg_id]
        assign_public_ip = false
      }
    }

    input = jsonencode({
      containerOverrides = [{
        name = "worker"
        environment = [
          { name = "WORKER", value = each.key },
        ]
      }]
    })
  }
}
