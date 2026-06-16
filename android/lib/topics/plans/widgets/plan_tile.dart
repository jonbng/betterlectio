import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/plan/study_plan.dart';
import 'package:lectio_wrapper/utils/dating.dart';
import 'package:betterlectio/topics/plans/screens/details.dart';
import 'package:betterlectio/utils/ad_route.dart';

class PlanTile extends StatelessWidget {
  const PlanTile({super.key, required this.ref});

  final StudyPlanRef ref;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      tileColor: Theme.of(context).colorScheme.surface,
      onTap: () {
        Navigator.push(
            context,
            adRoute(PlanDetails(
              ref: ref,
            )));
      },
      title: Text(ref.title),
      subtitle: Text(
          "Uge ${weekFromDateTime(ref.start)}${ref.end != null ? " - Uge ${weekFromDateTime(ref.end!)}" : ""}"),
    );
  }
}
