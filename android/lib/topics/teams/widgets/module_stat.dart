import 'dart:math';

import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';
import 'package:step_progress_indicator/step_progress_indicator.dart';

class ModuleStat extends StatelessWidget {
  const ModuleStat({super.key, required this.statistics, required this.team});
  final ModuleStatistics statistics;
  final Team team;
  @override
  Widget build(BuildContext context) {
    int steps = 15;
    int nearestHostedStep = statistics.normal != 0
        ? ((statistics.hosted / statistics.normal) * steps).round()
        : steps;
    int startStep = (steps / 2).ceil();
    int availableSteps = (steps / 2).floor();
    int endStep = (startStep + (statistics.deviation * availableSteps)).round();
    var colorscheme = Theme.of(context).colorScheme;
    return Card.outlined(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
        child: PaddedColumn(
            crossAxisAlignment: CrossAxisAlignment.start,
            padding: 8.0,
            children: [
              TextDivider(
                padding: EdgeInsets.zero,
                text: "",
                primary: true,
                customText: TeamName(teamName: team.name),
              ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: PaddedColumn(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      padding: 8.0,
                      children: [
                        Text(
                          "Afholdte",
                          style: BlTypography.bodySmall(context),
                        ),
                        StepProgressIndicator(
                          totalSteps: steps,
                          currentStep: nearestHostedStep,
                          selectedColor: colorscheme.primary,
                          unselectedColor: colorscheme.surfaceContainerHighest,
                        ),
                        Text(
                          "${statistics.hosted}/${statistics.normal} moduler",
                          style: BlTypography.bodySmall(context),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(
                    width: 16.0,
                  ),
                  Expanded(
                    child: PaddedColumn(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      padding: 8.0,
                      children: [
                        Text(
                          "Planlagte",
                          style: BlTypography.bodySmall(context),
                        ),
                        StepProgressIndicator(
                          totalSteps: steps,
                          customColor: (index) {
                            var largest = max(startStep, endStep);
                            var smallest = min(startStep, endStep);
                            return (smallest <= index && index <= largest) &&
                                    statistics.deviation != 0
                                ? colorscheme.primary
                                : colorscheme.surfaceContainerHighest;
                          },
                        ),
                        Text(
                          "${(statistics.deviation * 100).toStringAsFixed(1)}% afvigelse",
                          style: BlTypography.bodySmall(context),
                        ),
                      ],
                    ),
                  )
                ],
              )
            ]),
      ),
    );
  }
}
