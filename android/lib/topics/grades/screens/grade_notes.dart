import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/grades/note.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

import '../../../logic/student/student_cubit.dart';

class GradeNoteScreen extends StatelessWidget {
  const GradeNoteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return StudentBlocBuilder<StudentCubit<List<GradeNote>>, List<GradeNote>?>(
      builder: (context, state) {
        if (state!.isEmpty) {
          return const EmptyScreen();
        }
        var scheme = Theme.of(context).colorScheme;
        return SingleChildScrollView(
          child: ExpansionPanelList.radio(
              expandedHeaderPadding: EdgeInsets.zero,
              elevation: 0.0,
              children: state.map((note) {
                var textStyle = TextStyle(
                    color: scheme.onSurface, fontWeight: FontWeight.w500);
                return ExpansionPanelRadio(
                    canTapOnHeader: true,
                    headerBuilder: (context, isExpanded) {
                      return ListTile(
                        title: TeamName(
                          teamName: note.team.name,
                          builder: (name) {
                            return Text(
                              name,
                              style: textStyle,
                            );
                          },
                        ),
                        subtitle: Text(
                          note.gradeType,
                          style: textStyle,
                        ),
                      );
                    },
                    body: Padding(
                      padding: const EdgeInsets.symmetric(
                          vertical: 8.0, horizontal: 12.0),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              note.note.trim(),
                            ),
                          ),
                        ],
                      ),
                    ),
                    value: note);
              }).toList()),
        );
      },
    );
  }
}
