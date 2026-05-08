output "vpc_id" { value = module.network.vpc_id }
output "rds_endpoint" { value = module.database.rds_endpoint }
output "rds_proxy_endpoint" { value = module.database.rds_proxy_endpoint }
output "uploads_bucket" { value = module.storage.uploads_bucket_name }
output "web_assets_bucket" { value = module.storage.web_assets_bucket_name }
output "alb_dns_name" { value = module.service.alb_dns_name }
output "cluster_name" { value = module.service.cluster_name }
output "service_name" { value = module.service.service_name }

# Empty string when cdn_enabled = false. Consume the value (not the conditional)
# so downstream tooling can interpolate without having to gate.
output "cdn_domain_name" {
  value       = var.cdn_enabled ? module.cdn[0].domain_name : ""
  description = "Public CloudFront-served hostname. Empty when cdn_enabled = false."
}

output "cdn_distribution_id" {
  value       = var.cdn_enabled ? module.cdn[0].distribution_id : ""
  description = "CloudFront distribution ID for cache invalidation calls. Empty when cdn_enabled = false."
}
