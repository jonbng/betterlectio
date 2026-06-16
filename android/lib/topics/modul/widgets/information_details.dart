import 'package:date_format/date_format.dart';
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/events/calendar_event_details.dart';
import 'package:lectio_wrapper/types/rooms/room.dart';
import 'package:lectio_wrapper/types/weeks/calendar_event.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/modul/screens/modul_details_screen.dart';
import 'package:betterlectio/topics/people/widget/person_tile.dart';
import 'package:betterlectio/topics/rooms/widgets/room_tile.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/statement.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class InformationDetails extends StatelessWidget {
  const InformationDetails(
      {super.key,
      required this.event,
      required this.state,
      required this.teachers});
  final CalendarEvent event;
  final CalendarEventDetails state;
  final List<Student>? teachers;
  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const TextDivider(
          text: "Information",
          primary: true,
        ),
        ine(event.title)
            ? ListTile(
                title: Text(event.title),
                subtitle: const Text("Beskrivelse"),
              )
            : Container(),
        ine(event.room)
            ? StudentBlocBuilder<StudentCubit<List<Room>>, List<Room>?>(
                small: true,
                builder: (context, state) {
                  var matchingRoom = state!.where((room) =>
                      room.short.startsWith(event.room) &&
                      room.short.isNotEmpty &&
                      event.room.isNotEmpty);
                  if (matchingRoom.isNotEmpty) {
                    return RoomTile(
                      room: matchingRoom.first,
                      lokale: true,
                    );
                  }
                  return ListTile(
                    title: Text(event.room),
                    subtitle: const Text("Lokale"),
                  );
                },
              )
            : Container(),
        ListTile(
          title: Text("${formatDate(event.start, [
                HH,
                ':',
                nn
              ])}-${formatDate(event.end, [HH, ':', nn])}"),
          subtitle: const Text("Tidspunkt"),
        ),
        ine(event.team)
            ? ListTile(
                title: TeamName(teamName: event.team),
                subtitle: const Text("Hold"),
              )
            : Container(),
        event.teachers.isNotEmpty && (teachers == null || teachers!.isEmpty)
            ? ListTile(
                title: Text(event.teachers.length == 1
                    ? event.teachers.first
                    : event.teachers.map((e) => e.trim()).join(", ")),
                subtitle: Text(event.teachers.length > 1 ? "Lærere" : "Lærer"),
              )
            : Container(),
        ListTile(
          title: Text(event.status),
          subtitle: const Text("Status"),
        ),
        ...getSpecific(context, state),
        ...(teachers != null && teachers!.isNotEmpty
            ? [
                TextDivider(
                  text: teachers!.length > 1 ? "Lærere" : "Lærer",
                  primary: true,
                ),
                ...teachers!.map((teacher) => PersonTile(person: teacher))
              ]
            : [Container()]),
      ],
    );
  }

  List<Widget> getSpecific(BuildContext context, CalendarEventDetails details) {
    switch (event.type) {
      case CalendarEventType.private:
        return [
          ine(event.note)
              ? ListTile(
                  title: Text(event.note),
                  subtitle: const Text("Note"),
                )
              : Container(),
        ];
      case CalendarEventType.regular:
        var regDetails = details as RegularCalendarEventDetails;
        return [
          if (regDetails.note != null && regDetails.note!.isNotEmpty)
            Statement(topic: "Note", content: regDetails.note!),
        ];
      case CalendarEventType.test:
        var examDetails = details as TestCalendarEventDetails;
        return [
          const TextDivider(
            text: "Eksamen",
            primary: true,
          ),
          ListTile(
            title: Text(examDetails.room),
            subtitle: const Text("Lokale"),
          ),
          ListTile(
            title: Text(
                """${examDetails.student.preparingStart != null ? "${formatDate(examDetails.student.preparingStart!, [
                        HH,
                        ':',
                        nn
                      ])}-" : ""}${formatDate(examDetails.student.testStart, [
                  HH,
                  ':',
                  nn
                ])}-${formatDate(examDetails.student.testEnd, [
                  HH,
                  ':',
                  nn
                ])}"""),
            subtitle: const Text("Tidspunkt"),
          )
        ];
    }
  }
}
