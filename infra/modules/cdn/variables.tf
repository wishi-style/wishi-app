variable "project" {
  type        = string
  description = "Project name (e.g. wishi)."
}

variable "env" {
  type        = string
  description = "Environment (staging|production)."
}

variable "origin_alb_dns_name" {
  type        = string
  description = "DNS name of the ALB this distribution fronts."
}

variable "price_class" {
  type        = string
  default     = "PriceClass_100"
  description = "CloudFront price class. PriceClass_100 = North America + Europe edges only."
}

variable "aliases" {
  type        = list(string)
  default     = []
  description = "Alternate domain names served by this distribution. Empty list uses the default *.cloudfront.net cert."
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN in us-east-1. Required when aliases are configured."
}
