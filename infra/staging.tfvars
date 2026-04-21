project           = "wishi"
env               = "staging"
region            = "us-east-1"
domain            = "staging.wishi.me"
vpc_cidr          = "10.1.0.0/16"
nat_gateway_count = 1

# Database
db_instance_class    = "db.t4g.medium"
db_allocated_storage = 20
db_multi_az          = false

# Service
ecs_cpu           = 512
ecs_memory        = 1024
ecs_desired_count = 1
ecs_min_count     = 1
ecs_max_count     = 3

# CDN
cloudfront_price_class = "PriceClass_100"

# Observability
log_retention_days = 30

# Phase 5 — workers
# TODO(staging): set inventory_service_url to the tastegraph inventory ALB
# (currently lives in the tastegraph AWS account; likely routed via VPC peering
# or a public /internal endpoint behind auth). Leaving empty falls back to the
# inventory-client's empty-array-on-failure path: affiliate-prompt still runs
# but uses the "your recent find" generic title.
inventory_service_url = ""

# Phase 5 workers consume this for deep-link construction; Phase 6 scheduler
# is gated on https:// (infra/main.tf) and skips on staging until DNS/HTTPS
# lands. Manual trigger via POST /api/admin/workers/[name]/run in the meantime.
app_url = "http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com"
