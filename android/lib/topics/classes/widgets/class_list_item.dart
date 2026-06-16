import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/classes/screens/klasse_members_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';

class ClassListItem extends StatelessWidget {
  final ClassRef klasse;

  const ClassListItem({super.key, required this.klasse});

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.hardEdge,
      child: InkWell(
        onTap: () {
          Navigator.push(
              context, adRoute(KlasseMembersScreen(klasseRef: klasse)));
        },
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                klasse.name,
                style: LppTypography.labelSmall(context),
                textAlign: TextAlign.end,
                maxLines: 2,
              ),
              const Text("Stamklasse")
            ],
          ),
        ),
      ),
    );
  }
}
