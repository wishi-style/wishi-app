variable "project" { type = string }
variable "env" { type = string }

variable "cluster_name" {
  type        = string
  description = "ECS cluster name from the service module — workers share it."
}

variable "cluster_arn" { type = string }

variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "ecs_task_sg_id" { type = string }

# Secrets the worker tasks need at runtime. Only the subset the workers use;
# the service module owns the full list.
variable "db_url_secret_arn" { type = string }
variable "db_direct_url_secret_arn" { type = string }
variable "anthropic_api_key_arn" {
  type    = string
  default = ""
}
variable "vapid_public_key_arn" { type = string }
variable "vapid_private_key_arn" { type = string }

variable "ecr_worker_url" {
  type        = string
  description = "ECR repo URL for the worker image (e.g. .../wishi-worker)."
}

variable "inventory_service_url" {
  type        = string
  description = "Base URL of the tastegraph inventory service."
  default     = ""
}

variable "app_url" {
  type        = string
  description = "External URL used to build notification deep-links."
  default     = ""
}

variable "cpu" {
  type    = number
  default = 512
}
variable "memory" {
  type    = number
  default = 1024
}

variable "log_group_name" {
  type        = string
  description = "CloudWatch log group — reuses the workers group already provisioned by the observability module."
}
