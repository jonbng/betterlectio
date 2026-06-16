import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/entry.dart';
import 'package:betterlectio/topics/absence/widgets/absence_chart.dart';
import 'package:betterlectio/topics/absence/widgets/stat.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

import '../../../logic/student/student_cubit.dart';

class AbsenceOverview extends StatefulWidget {
  const AbsenceOverview({super.key, required this.absence});
  final List<AbsenceEntry> absence;

  @override
  State<AbsenceOverview> createState() => _AbsenceOverviewState();
}

class _AbsenceOverviewState extends State<AbsenceOverview> {
  double totalModulesYear = 0.0;
  double totalAbsenceModulesYear = 0.0;
  double totalModulesWrittenYear = 0.0;
  double totalModulesAbsenceWrittenYear = 0.0;
  double totalModulesOpgjort = 0.0;
  double totalAbsenceModulesOpgjort = 0.0;
  double totalModulesAbsenceWrittenOpgjort = 0.0;
  double totalModulesWrittenOpgjort = 0.0;
  bool hasNonNull = false;
  AbsenceEntry? mostAbsence;
  List<AbsenceEntry> entries = [];
  void _buildStats() async {
    hasNonNull = widget.absence
        .where((element) => element.regular.currentModules.current > 0)
        .isNotEmpty;
    mostAbsence = widget.absence[0];
    for (var row in widget.absence) {
      if (row.regular.finalModules.current >
          (mostAbsence?.regular.finalModules.current ?? 0)) {
        mostAbsence = row;
      }
      totalModulesYear += row.regular.finalModules.total;
      totalAbsenceModulesYear += row.regular.finalModules.current;
      totalModulesWrittenYear += row.assignment.finalStudentTime.total;
      totalModulesAbsenceWrittenYear += row.assignment.finalStudentTime.current;
      totalModulesOpgjort += row.regular.currentModules.total;
      totalAbsenceModulesOpgjort += row.regular.currentModules.current;
      totalModulesWrittenOpgjort += row.assignment.currentStudentTime.total;
      totalModulesAbsenceWrittenOpgjort +=
          row.assignment.currentStudentTime.current;
    }

    setState(() {
      entries = widget.absence
          .where((element) => element.regular.currentModules.current > 0)
          .toList();
    });
  }

  @override
  void initState() {
    super.initState();
    _buildStats();
  }

  @override
  void didUpdateWidget(covariant AbsenceOverview oldWidget) {
    super.didUpdateWidget(oldWidget);
    _buildStats();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: ListView(
        children: [
          if (hasNonNull)
            SizedBox(
                height: MediaQuery.of(context).size.height / 2,
                child: AbsenceChart(entries: entries)),
          Padding(
            padding: const EdgeInsets.only(top: 16.0),
            child: Row(
              children: [
                Statistic(header: "Normalt", stats: [
                  Stat(
                    title: "For året",
                    data:
                        "${(totalAbsenceModulesYear / totalModulesYear * 100).toStringAsFixed(1)}%",
                  ),
                  Stat(
                    title: "Opgjort",
                    data:
                        "${(totalAbsenceModulesOpgjort / totalModulesOpgjort * 100).toStringAsFixed(1)}%",
                  ),
                  Stat(
                      title: "Moduler",
                      data: "${totalAbsenceModulesOpgjort.round()} moduler")
                ]),
                Statistic(header: "Skriftligt", stats: [
                  Stat(
                    title: "For året",
                    data: totalModulesWrittenYear == 0
                        ? "0.0%"
                        : "${(totalModulesAbsenceWrittenYear / totalModulesWrittenYear * 100).toStringAsFixed(1)}%",
                  ),
                  Stat(
                    title: "Opgjort",
                    data: totalModulesWrittenOpgjort == 0
                        ? "0.0%"
                        : "${(totalModulesAbsenceWrittenOpgjort / totalModulesWrittenOpgjort * 100).toStringAsFixed(1)}%",
                  ),
                  Stat(
                      title: "Timer",
                      data:
                          "${totalModulesAbsenceWrittenOpgjort.round()} timer")
                ]),
              ],
            ),
          )
        ],
      ),
    );
  }
}

class AbsenceOverviewScreen extends StatelessWidget {
  const AbsenceOverviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return StudentBlocBuilder<StudentCubit<List<AbsenceEntry>>,
        List<AbsenceEntry>?>(builder: (context, absence) {
      if (absence != null) {
        return AbsenceOverview(absence: absence);
      }
      return const LoadingScreen();
    });
  }
}
