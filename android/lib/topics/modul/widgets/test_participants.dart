import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lectio_wrapper/types/events/calendar_event_details.dart';

final DateFormat hF = DateFormat("HH:mm");
final DateFormat dF = DateFormat("dd/MM");

class TestParticipantsList extends StatelessWidget {
  const TestParticipantsList({super.key, required this.details});
  final TestCalendarEventDetails details;
  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: details.otherStudents.length,
      itemBuilder: (context, index) {
        return TestParticipantTile(testStudent: details.otherStudents[index]);
      },
    );
  }
}

class TestParticipantTile extends StatelessWidget {
  const TestParticipantTile({super.key, required this.testStudent});
  final TestStudent testStudent;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(testStudent.name),
      subtitle: Text(
          "${dF.format(testStudent.testDate)} ${testStudent.preparingStart != null ? "${hF.format(testStudent.preparingStart!)}-" : ""}${hF.format(testStudent.testStart)}-${hF.format(testStudent.testEnd)}"),
    );
  }
}
