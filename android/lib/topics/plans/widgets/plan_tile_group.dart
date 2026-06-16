import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/plan/study_plan.dart';
import 'package:betterlectio/topics/plans/widgets/plan_tile.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class PlanTileGroup extends StatelessWidget {
  const PlanTileGroup({super.key, required this.entry});
  final StudyTeamEntry entry;
  @override
  Widget build(BuildContext context) {
    var sorted = entry.entries.take(entry.entries.length).toList()
      ..sort(
        (b, a) {
          return a.start.compareTo(b.start);
        },
      );
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextDivider(
            customText: TeamName(teamName: entry.team.name),
            text: entry.team.name,
            primary: true),
        ...sorted.map((ref) => PlanTile(ref: ref))
      ],
    );
  }
}
