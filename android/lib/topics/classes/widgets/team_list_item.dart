import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/classes/screens/klasse_members_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class TeamListItem extends StatelessWidget {
  final Team team;

  const TeamListItem({super.key, required this.team});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.hardEdge,
      child: InkWell(
        onTap: () {
          Navigator.push(
              context,
              adRoute(KlasseMembersScreen(
                klasseRef: ClassRef(name: team.displayName, id: team.id),
                isGroup: true,
              )));
        },
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              TeamName(
                teamName: team.name,
                builder: (name) {
                  return Text(
                    name,
                    style: LppTypography.labelSmall(context),
                    textAlign: TextAlign.end,
                    maxLines: 2,
                  );
                },
              ),
              const Text("Hold")
            ],
          ),
        ),
      ),
    );
  }
}
