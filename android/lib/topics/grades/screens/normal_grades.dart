import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/grades/grade.dart';
import 'package:lectio_wrapper/types/grades/subject.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

class SpecificGradeScreen extends StatelessWidget {
  const SpecificGradeScreen({super.key, required this.grades});

  final Map<(Team, Subject), Grade?> grades;

  @override
  Widget build(BuildContext context) {
    if (grades.isEmpty) {
      return const EmptyScreen();
    }

    double totalWeight = 0.0;
    double totalGrade = 0.0;
    int basedOn = 0;
    for (var grade in grades.values) {
      if (grade != null) {
        basedOn++;
        totalGrade += grade.grade * grade.weight;
        totalWeight += grade.weight;
      }
    }
    var entries = grades.entries.toList();
    return Column(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: ListView(
            shrinkWrap: true,
            children: entries
                .map((entry) => ListTile(
                      trailing: Text(
                        entry.value != null
                            ? entry.value!.grade.toString()
                            : "-",
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                      title: TeamName(
                        teamName: entry.key.$1.name,
                        builder: (name) {
                          return Text(
                            "$name${entry.key.$2.type != null ? ", ${entry.key.$2.type == SubjectTypes.oral ? "Mundtlig" : "Skriftlig"}" : ""}",
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                          );
                        },
                      ),
                    ))
                .toList(),
          ),
        ),
        ListTile(
          tileColor: Theme.of(context).colorScheme.primary,
          titleTextStyle: TextStyle(
              color: Theme.of(context).colorScheme.onPrimary,
              fontWeight: FontWeight.bold),
          title: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text("Snit"),
              Text(basedOn == 0
                  ? "-"
                  : (totalGrade / totalWeight).toStringAsFixed(1))
            ],
          ),
        )
      ],
    );
  }
}
