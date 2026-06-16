import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';

class AppointmentBloc extends Cubit<PrivateAppointmentState> {
  final Student student;

  AppointmentBloc(this.student, {CalendarEvent? event})
      : super(event != null
            ? PrivateAppointmentState(
                event.title, event.note, event.start, event.end)
            : PrivateAppointmentState(
                "",
                "",
                DateTime.now().copyWith(hour: TimeOfDay.now().hour, minute: 0),
                DateTime.now().copyWith(hour: TimeOfDay.now().hour, minute: 30),
              ));

  void setStart(DateTime start) {
    emit(state.copyWith(start: start));
  }

  void setEnd(DateTime end) {
    emit(state.copyWith(end: end));
  }

  void setTitle(String title) {
    emit(state.copyWith(title: title));
  }

  void setNote(String note) {
    emit(state.copyWith(note: note));
  }
}

class PrivateAppointmentState {
  final String title;
  final String note;
  final DateTime start;
  final DateTime end;
  late bool valid;
  PrivateAppointmentState(this.title, this.note, this.start, this.end) {
    if (title.isNotEmpty && start.isBefore(end)) {
      valid = true;
      return;
    }
    valid = false;
  }

  PrivateAppointmentState copyWith(
      {String? title,
      String? note,
      DateTime? start,
      DateTime? end,
      bool? valid}) {
    return PrivateAppointmentState(title ?? this.title, note ?? this.note,
        start ?? this.start, end ?? this.end);
  }
}
