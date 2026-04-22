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

# Phase 5 — workers. Tastegraph staging inventory service (public ALB in
# the tastegraph AWS account; /internal/* endpoints are open — no auth
# key required as of 2026-04-21, confirmed via /internal/commissions
# probe). Swap to https://inventory.mira.prepx.ai for production.
inventory_service_url = "https://inventory.stg.mira.prepx.ai"

# Phase 5 workers consume this for deep-link construction; Phase 6 scheduler
# is gated on https:// (infra/main.tf) and skips on staging until DNS/HTTPS
# lands. Manual trigger via POST /api/admin/workers/[name]/run in the meantime.
app_url = "http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com"

# Staging serves the /demo page with seeded accounts + nightly reset.
# isE2EAuthModeEnabled() double-gates this off on production; never flip it
# in production.tfvars.
enable_demo_mode = true
