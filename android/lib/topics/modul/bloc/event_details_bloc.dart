import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/context/student.dart';
import 'package:lectio_wrapper/types/events/calendar_event_details.dart';

class EventDetailsBloc extends Cubit<EventDetailsState> {
  final Student student;
  final CalendarEvent calendarEvent;
  EventDetailsBloc(this.student, this.calendarEvent)
      : super(EventDetailsState.initial()) {
    _load();
  }

  Future<void> _load() async {
    List<Student> teachers = [];
    for (var teacher in calendarEvent.teacherObjs) {
      var teacherContext =
          (await student.context.get(teacher.id)) as StudentContext;
      teachers.add(Student(teacherContext.id.replaceAll("T", ""), student.gymId)
        ..imageId = teacherContext.imageId
        ..name = teacherContext.name
        ..info = teacher.name
        ..teacher = true);
    }
    if (student.info == null) {
      student.setBasicInfo(await student.getBasicInfo());
      student.info = "";
    }
    var expanded = await student.events.expand(calendarEvent);
    emit(EventDetailsState(expanded, teachers));
  }
}

class EventDetailsState {
  CalendarEventDetails? details;
  List<Student>? teachers;
  EventDetailsState(this.details, this.teachers);

  factory EventDetailsState.initial() {
    return EventDetailsState(null, null);
  }
}
