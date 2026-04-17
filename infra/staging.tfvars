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

# Scheduler targets the staging ALB (CloudFront/HTTPS deferred).
app_url = "http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com"
