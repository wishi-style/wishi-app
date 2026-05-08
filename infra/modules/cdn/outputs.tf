output "domain_name" {
  description = "CloudFront-served hostname (e.g. dxxxxxxxx.cloudfront.net)."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.main.id
}

output "hosted_zone_id" {
  description = "CloudFront-managed Route 53 hosted zone ID. Use as the alias target zone when wiring DNS."
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}
