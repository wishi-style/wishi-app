variable "project" { type = string }
variable "env" { type = string }

locals {
  name = "${var.project}-${var.env}"
}

# -----------------------------------------------------------------------------
# Uploads bucket (user avatars, closet photos, board photos, chat media)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket = "${var.project}-uploads-${var.env}"

  tags = { Name = "${local.name}-uploads" }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    filter { prefix = "" }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}

# -----------------------------------------------------------------------------
# Web assets bucket (Next.js static assets served via CloudFront)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "web_assets" {
  bucket = "${var.project}-web-assets-${var.env}"

  tags = { Name = "${local.name}-web-assets" }
}

resource "aws_s3_bucket_public_access_block" "web_assets" {
  bucket = aws_s3_bucket.web_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web_assets" {
  bucket = aws_s3_bucket.web_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "uploads_bucket_name" { value = aws_s3_bucket.uploads.bucket }
output "uploads_bucket_arn" { value = aws_s3_bucket.uploads.arn }
output "web_assets_bucket_name" { value = aws_s3_bucket.web_assets.bucket }
output "web_assets_bucket_arn" { value = aws_s3_bucket.web_assets.arn }
output "web_assets_bucket_regional_domain_name" { value = aws_s3_bucket.web_assets.bucket_regional_domain_name }
