variable "project" { type = string }
variable "env" { type = string }

locals {
  # Secrets that are NOT managed by other modules (database module handles its own)
  secrets = [
    "clerk/secret_key",
    "clerk/publishable_key",
    "clerk/webhook_secret",
    "stripe/secret_key",
    "stripe/webhook_secret",
    "stripe/connect_webhook_secret",
    "twilio/account_sid",
    "twilio/auth_token",
    "twilio/api_key_sid",
    "twilio/api_key_secret",
    "twilio/conversations_service_sid",
    "klaviyo/api_key",
    "anthropic/api_key",
    "mixpanel/token",
    "web_push/vapid_public_key",
    "web_push/vapid_private_key",
    "app/cron_secret",
  ]
}

resource "aws_secretsmanager_secret" "app" {
  for_each = toset(local.secrets)
  name     = "${var.project}/${var.env}/${each.value}"

  tags = { Name = "${var.project}-${var.env}-${replace(each.value, "/", "-")}" }
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = toset(local.secrets)
  secret_id     = aws_secretsmanager_secret.app[each.value].id
  secret_string = "CHANGE_ME"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "secret_arns" {
  value = { for k, v in aws_secretsmanager_secret.app : k => v.arn }
}
