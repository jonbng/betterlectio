import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/topics/assignments/scraping.dart';
import 'package:lectio_wrapper/types/assignment.dart';
import 'package:lectio_wrapper/types/primitives/file.dart';
import 'package:betterlectio/topics/calendar/widgets/day_event.dart';
import 'package:betterlectio/topics/modul/screens/modul_details_screen.dart';
import 'package:betterlectio/topics/modul/screens/modul_lektie_screen.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_details_bloc.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/utils/helpers.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

import '../../state/loading.dart';

class OpgaveScreen extends StatelessWidget {
  const OpgaveScreen({super.key, required this.ref});

  final AssignmentRef ref;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: BlAppbar(
          hideMenu: true,
          title: ref.title,
        ),
        body: BlocBuilder<OpgaveDetailsBloc, Assignment?>(
          builder: (context, state) {
            if (state != null && state.id == ref.id) {
              var assignment = state;
              return ListView(
                children: [
                  const TextDivider(
                    text: "Information",
                    primary: true,
                  ),
                  ListTile(
                    title: Text(assignment.title),
                    subtitle: const Text("Titel"),
                  ),
                  ListTile(
                    title: TeamName(
                      teamName: assignment.team.name,
                    ),
                    subtitle: const Text("Hold"),
                  ),
                  ine(assignment.note)
                      ? ListTile(
                          title: Text(assignment.note),
                          subtitle: const Text("Note"),
                        )
                      : Container(),
                  ListTile(
                    title: Text(ref.status),
                    subtitle: const Text("Status"),
                  ),
                  ListTile(
                    title: Text(assignment.grading),
                    subtitle: const Text("Karaktertype"),
                  ),
                  if (assignment.grade.isNotEmpty)
                    ListTile(
                      title: Text(assignment.grade.toString()),
                      subtitle: const Text("Karakter"),
                    ),
                  if (assignment.gradeNote.trim().isNotEmpty)
                    ListTile(
                      title: Text(assignment.gradeNote),
                      subtitle: const Text("Karakternote"),
                    ),
                  ListTile(
                    title: Text("${assignment.absence}%"),
                    subtitle: const Text("Fravær"),
                  ),
                  ListTile(
                    subtitle: const Text("Deadline"),
                    title: Text(
                        "${formatDateReadable(assignment.deadline)} - ${hF.format(assignment.deadline)}"),
                  ),
                  ListTile(
                    title: Text(
                        "${assignment.hours.toString().replaceAll(".", ",")} timer"),
                    subtitle: const Text("Elevtid"),
                  ),
                  ...getTestFiles(context, state.testFiles),
                  ...getEntries(context, state.entries)
                ],
              );
            }
            return const LoadingScreen();
          },
        ));
  }

  List<Widget> getTestFiles(BuildContext context, List<File> testFiles) {
    if (testFiles.isEmpty) {
      return [];
    }
    return [
      const TextDivider(
        text: "Dokumenter",
        primary: true,
      ),
      ...testFiles.map((e) => ListTile(
            title: Text(e.name),
            onTap: () {
              Navigator.push(
                  context,
                  adRoute(
                      ModulLektieScreen(content: FileDetails(e.name, e.href)),
                      onlyFromEdge: true));
            },
          ))
    ];
  }

  List<Widget> getEntries(BuildContext context, List<AssignmentEntry> entries) {
    return [
      const TextDivider(
        text: "Indlæg",
        primary: true,
      ),
      ...(entries.isEmpty
          ? [
              const SizedBox(
                  height: 100.0,
                  child: Center(child: Text("Der er ingen indlæg 😒")))
            ]
          : entries.map((e) => AssignmentEntryRow(entry: e)).toList())
    ];
  }
}

class AssignmentEntryRow extends StatelessWidget {
  final AssignmentEntry entry;

  const AssignmentEntryRow({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () {
        debugPrint(entry.resource.href);
        Navigator.push(
            context,
            adRoute(
                ModulLektieScreen(
                    content:
                        FileDetails(entry.resource.name, entry.resource.href)),
                onlyFromEdge: true));
      },
      title: Text(entry.resource.name),
      subtitle: Text(
          "Afleveret af ${entry.user.name} - ${deadlineFormat.format(entry.time)}"),
    );
  }
}
