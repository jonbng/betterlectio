import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/cause.dart';
import 'package:betterlectio/topics/absence/widgets/absence_edit.dart';
import 'package:betterlectio/topics/absence/widgets/absence_percentage_circle.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class AbsenceRegistration extends StatelessWidget {
  const AbsenceRegistration({super.key, required this.absenceCause});
  final AbsenceCauseEntry absenceCause;
  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
          contentPadding: const EdgeInsets.all(10.0),
          leading: SizedBox(
              height: 65.0,
              width: 65.0,
              child: AbsencePercentageCircle(
                percentage: absenceCause.absence,
                cause: absenceCause.cause,
              )),
          title: TeamName(teamName: absenceCause.module.team),
          subtitle: Text(
            "${absenceCause.cause != null ? absenceCause.cause!.name : "Mangler"} ${absenceCause.expandedCause.isNotEmpty ? "-" : ""} ${absenceCause.expandedCause}",
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: IconButton(
              onPressed: () {
                adSheet(EditAbsence(cause: absenceCause), context,
                    skipColumn: true);
              },
              icon: const Icon(EvaIcons.editOutline))),
    );
  }
}
