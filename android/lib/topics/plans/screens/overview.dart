import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/plan/study_plan.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/plans/widgets/plan_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class PlanOverview extends StatelessWidget {
  const PlanOverview({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const LppAppbar(title: "Studieplan"),
      body: StudentBlocBuilder<StudentCubit<List<StudyTeamEntry>>,
          List<StudyTeamEntry>?>(
        builder: (context, state) {
          if (state!.isEmpty) {
            return const EmptyScreen();
          }
          var nonEmpty =
              state.where((element) => element.entries.isNotEmpty).toList();
          var colorScheme = Theme.of(context).colorScheme;
          return SingleChildScrollView(
            child: ExpansionPanelList.radio(
                elevation: 0.0,
                expandedHeaderPadding: EdgeInsets.zero,
                children: nonEmpty
                    .map((plan) => ExpansionPanelRadio(
                        canTapOnHeader: true,
                        value: plan,
                        headerBuilder: (context, isExpanded) {
                          return ListTile(
                            title: TeamName(
                              teamName: plan.team.name,
                              builder: (name) {
                                return Text(
                                  name,
                                  style: TextStyle(
                                      color: colorScheme.primary,
                                      fontWeight: FontWeight.w500,
                                      fontSize: 16.0),
                                );
                              },
                            ),
                          );
                        },
                        body: Column(
                          children: plan.entries
                              .map((entry) => PlanTile(ref: entry))
                              .toList(),
                        )))
                    .toList()),
          );
        },
      ),
    );
  }
}
