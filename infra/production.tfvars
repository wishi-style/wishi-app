project           = "wishi"
env               = "production"
region            = "us-east-1"
domain            = "wishi.me"
vpc_cidr          = "10.0.0.0/16"
nat_gateway_count = 2

# Database
db_instance_class    = "db.t4g.medium"
db_allocated_storage = 50
db_multi_az          = true

# Service
ecs_cpu           = 1024
ecs_memory        = 2048
ecs_desired_count = 2
ecs_min_count     = 2
ecs_max_count     = 6

# CDN
cloudfront_price_class = "PriceClass_200"

# Observability
log_retention_days = 90

# Phase 5 — workers / Phase 6 — scheduler. inventory_service_url is the
# tastegraph production inventory ALB (public, unauthenticated /internal/*
# endpoints). app_url stays empty until wishi.me moves off the legacy AWS
# account into Route 53 here — scheduler module is gated on https://
# (infra/main.tf) and skips while empty.
inventory_service_url = "https://inventory.mira.prepx.ai"
app_url               = ""
