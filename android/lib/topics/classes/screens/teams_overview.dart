import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/classes/widgets/team_list_item.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

class TeamsOverviewScreen extends StatelessWidget {
  const TeamsOverviewScreen({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return StudentBlocBuilder<StudentCubit<List<Team>>, List<Team>?>(
      builder: (context, state) {
        List<Team> teams = state!;
        if (teams.isEmpty) {
          return const EmptyScreen();
        }
        return GridView.builder(
          padding: const EdgeInsets.all(6.0),
          itemCount: teams.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              childAspectRatio: 16.0 / 10.0, crossAxisCount: 2),
          itemBuilder: (context, index) {
            return TeamListItem(team: teams.elementAt(index));
          },
        );
      },
    );
  }
}
