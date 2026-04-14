output "vpc_id" { value = module.network.vpc_id }
output "rds_endpoint" { value = module.database.rds_endpoint }
output "rds_proxy_endpoint" { value = module.database.rds_proxy_endpoint }
output "uploads_bucket" { value = module.storage.uploads_bucket_name }
output "web_assets_bucket" { value = module.storage.web_assets_bucket_name }
output "alb_dns_name" { value = module.service.alb_dns_name }
output "cluster_name" { value = module.service.cluster_name }
output "service_name" { value = module.service.service_name }
