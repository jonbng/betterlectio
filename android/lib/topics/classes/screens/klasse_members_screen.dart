import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:betterlectio/topics/classes/screens/elev_list.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';
import 'package:betterlectio/widgets/primitive/team_name.dart';

import '../../../logic/student/student_bloc.dart';
import '../../../logic/student/student_cubit.dart';

class KlasseMembersScreen extends StatelessWidget {
  final ClassRef klasseRef;
  final bool isGroup;
  const KlasseMembersScreen(
      {super.key, required this.klasseRef, this.isGroup = false});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BlAppbar(
        title: klasseRef.name,
        hideMenu: true,
        titleWidget: isGroup ? TeamName(teamName: klasseRef.name) : null,
      ),
      body: StudentBlocBuilder<StudentCubit<Class>, Class?>(
        bloc: StudentCubit(
            student: getStudentBloc(context).state.student!,
            selector: (student) =>
                student.classes.get(klasseRef, group: isGroup))
          ..load(),
        builder: (context, state) {
          return StudentList(klasse: state!);
        },
      ),
    );
  }
}
