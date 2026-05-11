variable "project" {
  type    = string
  default = "wishi"
}

variable "env" {
  type = string
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "domain" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "nat_gateway_count" {
  type    = number
  default = 1
}

# Database
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  type    = bool
  default = false
}

# Service
variable "ecs_cpu" {
  type    = number
  default = 512
}

variable "ecs_memory" {
  type    = number
  default = 1024
}

variable "ecs_desired_count" {
  type    = number
  default = 1
}

variable "ecs_min_count" {
  type    = number
  default = 1
}

variable "ecs_max_count" {
  type    = number
  default = 3
}

# CDN
variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_100"
}

variable "cdn_enabled" {
  type        = bool
  default     = false
  description = "Provision a CloudFront distribution in front of the ALB. Required to terminate HTTPS for envs that don't yet have an ACM cert on the ALB itself (staging today — wishi.me Route 53 zone is on the legacy AWS account)."
}

variable "cdn_aliases" {
  type        = list(string)
  default     = []
  description = "Alternate domain names (CNAMEs) for the CloudFront distribution. Empty list uses the default *.cloudfront.net cert. Set together with cdn_certificate_arn once a real domain + ACM cert are wired."
}

variable "cdn_certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN in us-east-1 for the cdn_aliases. Required when cdn_aliases is non-empty."
}

# Observability
variable "log_retention_days" {
  type    = number
  default = 30
}

# Phase 5 — workers
variable "inventory_service_url" {
  type        = string
  description = "Base URL of the tastegraph inventory service (no trailing slash)."
  default     = ""
}

variable "app_url" {
  type        = string
  description = "Public app URL. Used by Phase 5 workers for notification deep-links and by the Phase 6 EventBridge Scheduler module to invoke /api/workers/*. The scheduler module additionally requires https:// and will fail its precondition for http values."
  default     = ""
}

variable "alert_email_recipients" {
  type        = list(string)
  description = "Email addresses to subscribe to the per-env alerts SNS topic. Each address must confirm the SES subscription email after the first apply."
  default     = []
}

variable "scheduler_enabled" {
  type        = bool
  default     = false
  description = "Enable the Phase 6 EventBridge Scheduler module (api-destination workers for waitlist-notify, payout-reconcile, loyalty-recalc). Off by default — the module emits a `Provided Arn is not in correct format` validation error on first apply that needs untangling before this flag can flip to true. Phase 5 workers (workers module) keep firing on their own schedules independent of this flag."
}
