import 'package:lectio_wrapper/lectio_wrapper.dart';

class ExperimentalSchemaState {
  List<Week> weeks;
  DateTime time;
  DateTime startTime;
  ExperimentalSchemaState(
      {required this.weeks, required this.time, required this.startTime});

  ExperimentalSchemaState copyWith({List<Week>? weeks, DateTime? time}) {
    return ExperimentalSchemaState(
        weeks: weeks ?? this.weeks,
        time: time ?? this.time,
        startTime: startTime);
  }

  ExperimentalSchemaState addWeek(Week week) {
    return copyWith(weeks: [...weeks, week]);
  }

  factory ExperimentalSchemaState.initial() {
    var now = DateTime.now();
    return ExperimentalSchemaState(weeks: [], time: now, startTime: now);
  }
}
