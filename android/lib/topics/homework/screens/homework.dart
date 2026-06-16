import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/homework/homework.dart';
import 'package:betterlectio/logic/student/student_cubit_refresh.dart';
import 'package:betterlectio/topics/homework/widgets/homework_group_list.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

import '../../../logic/student/student_cubit.dart';
import '../../state/empty.dart';

class HomeworkScreen extends StatelessWidget {
  const HomeworkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BlAppbar(
        title: "Lektier",
      ),
      body: StudentCubitRefresh<StudentCubit<List<Homework>>>(
        child:
            StudentBlocBuilder<StudentCubit<List<Homework>>, List<Homework>?>(
          builder: (context, state) {
            List<Homework> fakeHomework = state!;
            if (fakeHomework.isEmpty) {
              return const EmptyScreen();
            }
            return HomeworkGroupList(homework: fakeHomework);
          },
        ),
      ),
    );
  }
}
