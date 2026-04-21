output "task_definition_arn" {
  value = aws_ecs_task_definition.workers.arn
}

output "schedule_names" {
  value = [for s in aws_scheduler_schedule.worker : s.name]
}
