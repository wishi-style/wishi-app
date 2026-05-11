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
#
# CloudFront fronts the ALB so staging can serve HTTPS without an ACM cert on
# the ALB itself (the wishi.me Route 53 zone is still on the legacy AWS account
# so we can't validate a cert for staging.wishi.me here yet). After the first
# apply, `terraform output cdn_domain_name` returns the *.cloudfront.net
# hostname; copy it into `app_url` below and re-apply so the ECS task
# definition picks up the new APP_URL env. Add the same hostname to the Clerk
# dev instance Domains list so dev-browser cookie sync works.
cloudfront_price_class = "PriceClass_100"
cdn_enabled            = true
# When DNS migrates and ACM is wired, set the real domain + cert:
# cdn_aliases         = ["staging.wishi.me"]
# cdn_certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..."

# Observability
log_retention_days = 30

# Phase 5 — workers. Tastegraph staging inventory service (public ALB in
# the tastegraph AWS account; /internal/* endpoints are open — no auth
# key required as of 2026-04-21, confirmed via /internal/commissions
# probe). Swap to https://inventory.mira.prepx.ai for production.
inventory_service_url = "https://inventory.stg.mira.prepx.ai"

# Phase 5 workers consume this for deep-link construction. Phase 6 scheduler
# is gated on https:// (infra/main.tf); now that CloudFront fronts the ALB
# the scheduler activates on apply. CloudFront-served domain matches
# cdn_domain_name output (d2mt49xs07o9rr.cloudfront.net). Replace with the
# real domain when DNS migrates.
app_url = "https://d2mt49xs07o9rr.cloudfront.net"

# Alarm fan-out. Each recipient must confirm the SNS subscription email AWS
# sends after the first apply.
alert_email_recipients = ["matthewcar@wishi.me"]
