import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/grades/grade.dart';
import 'package:lectio_wrapper/types/grades/subject.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';
import 'package:betterlectio/topics/grades/screens/grade_notes.dart';
import 'package:betterlectio/topics/grades/screens/normal_grades.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/tabbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

import '../../../logic/student/student_cubit.dart';

final List<String> names = [
  "1. Standpunkt",
  "2. Standpunkt",
  "Afsluttende karakter",
  "Årskarakter",
  "Eksamenskarakter",
  "Noter",
];

class GradeScreen extends StatefulWidget {
  const GradeScreen({super.key});

  @override
  State<GradeScreen> createState() => _GradeScreenState();
}

class _GradeScreenState extends State<GradeScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: names.length, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: BlAppbar(
          title: "Karakterer",
          bottom: BlTabBar(
            tabs: names,
            scrollable: true,
            controller: _tabController,
          ),
        ),
        body: StudentBlocBuilder<StudentCubit<List<GradeRow>>, List<GradeRow>?>(
            builder: (context, state) {
          List<Map<(Team, Subject), Grade?>> types = names
              .take(names.length - 1)
              .map((e) => <(Team, Subject), Grade?>{})
              .toList();
          for (var row in state!) {
            types[0].putIfAbsent(
                (row.team, row.subject), () => row.firstStandpunkt);
            types[1].putIfAbsent(
                (row.team, row.subject), () => row.secondStandpunkt);
            types[2]
                .putIfAbsent((row.team, row.subject), () => row.finalYearGrade);
            types[3]
                .putIfAbsent((row.team, row.subject), () => row.internalTest);
            types[4].putIfAbsent((row.team, row.subject), () => row.yearGrade);
          }
          return TabBarView(
              controller: _tabController,
              children: types
                  .sublist(0, 5)
                  .map<Widget>((e) => SpecificGradeScreen(
                        grades: e,
                      ))
                  .toList()
                ..addAll([const GradeNoteScreen()]));
        }));
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}
