import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/plan/study_plan.dart';
import 'package:lectio_wrapper/utils/dating.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/statement.dart';

class PlanDetails extends StatelessWidget {
  const PlanDetails({super.key, required this.ref});
  final StudyPlanRef ref;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BlAppbar(title: ref.title),
      body: StudentBlocBuilder<StudentCubit<StudyPlanEntry>, StudyPlanEntry?>(
        bloc: StudentCubit(
            student: getStudentBloc(context).state.student!,
            selector: (student) => student.plans.get(ref))
          ..load(),
        builder: (context, state) {
          return ListView(
            children: [
              Statement(
                content: state!.teacher.name,
                topic: "Lærer",
              ),
              Statement(
                  topic: "Periode",
                  content:
                      "Uge ${weekFromDateTime(ref.start)}${ref.end != null ? " - Uge ${weekFromDateTime(ref.end!)}" : ""}"),
              Statement(
                content: state.description,
                topic: "Beskrivelse",
              )
            ],
          );
        },
      ),
    );
  }
}
