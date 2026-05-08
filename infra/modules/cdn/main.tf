locals {
  origin_id = "${var.project}-${var.env}-alb-origin"

  # AWS-managed CloudFront policies. IDs are stable and global.
  # Cache: pass-through, no edge caching (Next.js owns its own cache headers).
  managed_cache_policy_caching_disabled_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  # Origin request: forward all viewer headers + cookies + query strings to
  # the origin. Required so server actions (POST), Clerk session cookies, and
  # CSRF tokens reach the ALB intact.
  managed_origin_request_policy_all_viewer_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  # Response headers: standard security headers (HSTS, X-Content-Type-Options,
  # Referrer-Policy). Safe defaults — the app can still set its own headers
  # on top.
  managed_response_headers_policy_security_headers_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project} ${var.env} — HTTPS edge in front of ALB"
  price_class     = var.price_class
  http_version    = "http2"

  aliases = var.aliases

  origin {
    domain_name = var.origin_alb_dns_name
    origin_id   = local.origin_id

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = local.managed_cache_policy_caching_disabled_id
    origin_request_policy_id   = local.managed_origin_request_policy_all_viewer_id
    response_headers_policy_id = local.managed_response_headers_policy_security_headers_id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Default *.cloudfront.net certificate when no aliases are configured (the
  # bootstrap state for staging). When aliases are set, an ACM certificate in
  # us-east-1 must be supplied via certificate_arn.
  viewer_certificate {
    cloudfront_default_certificate = length(var.aliases) == 0
    acm_certificate_arn            = length(var.aliases) > 0 ? var.certificate_arn : null
    minimum_protocol_version       = length(var.aliases) > 0 ? "TLSv1.2_2021" : null
    ssl_support_method             = length(var.aliases) > 0 ? "sni-only" : null
  }

  tags = {
    Name = "${var.project}-${var.env}-cdn"
  }
}
