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

# Observability
variable "log_retention_days" {
  type    = number
  default = 30
}

variable "app_url" {
  type        = string
  description = "Base URL of the deployed app — used by EventBridge Scheduler to invoke /api/workers/*"
}
