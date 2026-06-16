sealed class ExperimentalSchemaEvent {}

final class SwitchDate extends ExperimentalSchemaEvent {
  final DateTime time;
  SwitchDate(this.time);
}
