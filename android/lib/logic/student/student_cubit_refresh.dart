import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';

class StudentCubitRefresh<T extends StudentCubit> extends StatelessWidget {
  const StudentCubitRefresh({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
        child: child,
        onRefresh: () async {
          var bloc = context.read<T>();
          await bloc.refresh();
        });
  }
}
