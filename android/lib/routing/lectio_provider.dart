import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/types/class.dart';
import 'package:lectio_wrapper/types/grades/grade.dart';
import 'package:lectio_wrapper/types/grades/note.dart';
import 'package:lectio_wrapper/types/homework/homework.dart';
import 'package:betterlectio/topics/absence/bloc/registation.dart';
import 'package:betterlectio/topics/homework/bloc/homework_bloc.dart';
import 'package:betterlectio/topics/messages/bloc/message_bloc.dart';
import 'package:betterlectio/topics/messages/bloc/new_message_bloc.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_bloc.dart';
import 'package:betterlectio/topics/opgaver/bloc/opgaver_details_bloc.dart';
import 'package:betterlectio/topics/people/bloc/people_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/notification_bloc.dart';
import 'package:betterlectio/topics/settings/bloc/term_bloc.dart';
import 'package:betterlectio/topics/studiekort/studiekort_bloc.dart';
import 'package:betterlectio/topics/teams/bloc/module_statistics_bloc.dart';
import '../topics/calendar/bloc/schema_bloc.dart';
import '../logic/student/student_bloc.dart';
import '../logic/student/student_cubit.dart';

class LectioProvider extends StatelessWidget {
  const LectioProvider({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    var studentBloc = getStudentBloc(context);
    var student = studentBloc.state.student!;

    return MultiBlocProvider(providers: [
     
      BlocProvider(
        create: (context) => StudentCubit(
          student: student,
          selector: (student) {
            return student.teams.list();
          },
        ),
      ),
    
      BlocProvider(
        create: (context) => OpgaveDetailsBloc(student),
      ),
      BlocProvider(
        create: (context) => TermBloc(student),
      ),
      BlocProvider(
          create: (context) => StudentCubit<List<Homework>>(
                selector: (student) {
                  return student.homework.list();
                },
                student: student,
              )),
      BlocProvider(
        create: (context) =>
            SchemaBloc(student, studentBloc)..add(SwitchedDate(DateTime.now())),
      ),
      BlocProvider(
          create: (context) => StudentCubit(
              student: student,
              selector: (student) {
                return student.absence.list();
              })),
      BlocProvider(
        create: (context) =>
            OpgaveBloc(student)..add(RequestedLoadAssignments()),
      ),
      BlocProvider(
        create: (context) => AbsenceRegistrationsCubit(student: student),
      ),
      BlocProvider(
          create: (context) => StudentCubit<List<GradeRow>>(
              student: student, selector: (student) => student.grades.list())),
      BlocProvider(
        create: (context) => StudentCubit<List<GradeNote>>(
            student: student,
            selector: (student) => student.grades.notes.list()),
      ),
      BlocProvider(
        create: (context) => StudentCubit<List<ClassRef>>(
            student: student, selector: (student) => student.classes.list()),
      ),
      BlocProvider(
          create: (_) => NewMessageBloc(getStudentBloc(context).state.student!)
            ..add(Load())),
      BlocProvider<MessageBloc>(
        create: (context) => MessageBloc(student)..add(LoadRefs()),
      ),
      BlocProvider(
        //lazy: false,
        create: (context) => StudentCubit(
            student: student, selector: (student) => student.rooms.list()),
      ),
      BlocProvider(
        create: (context) => StudentCubit(
            student: student, selector: (student) => student.plans.list()),
      ),
      BlocProvider(
        create: (_) => StudentCubit(
          student: student,
          selector: (student) => student.grades.getExamProof(),
        ),
      ),
      BlocProvider(
        create: (context) => ModuleStatisticsBloc(student),
      ),
      BlocProvider(create: (_) => HomeworkManagerBloc()),
      BlocProvider(
          create: (_) => StudentCubit(
              student: student, selector: (student) => student.getBasicInfo())),
      BlocProvider(
          create: (_) => StudentCubit(
              student: student, selector: (student) => student.getBasicInfo())),
      BlocProvider(lazy: false, create: (_) => PeopleBloc(student)..load()),
      BlocProvider(
        create: (context) => StudiekortBloc(student: student),
      ),
      BlocProvider(
        lazy: false,
        create: (context) => NotificationBloc(),
      )
    ], child: child);
  }
}
