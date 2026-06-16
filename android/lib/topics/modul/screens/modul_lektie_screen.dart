import 'dart:io';

import 'package:flutter/material.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/modul/widgets/resource_view.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

class FileDetails {
  String name;
  String href;
  bool isFile;
  FileDetails(this.name, this.href, {this.isFile = false});
}

class ModulLektieScreen extends StatefulWidget {
  final FileDetails content;
  const ModulLektieScreen({super.key, required this.content});

  @override
  State<ModulLektieScreen> createState() => _ModulLektieScreenState();
}

class _ModulLektieScreenState extends State<ModulLektieScreen> {
  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: LppAppbar(
          title: widget.content.name,
          hideMenu: true,
        ),
        body: StudentBlocBuilder<StudentCubit<List<Cookie>>, List<Cookie>?>(
            bloc: StudentCubit(
                student: getStudentBloc(context).state.student!,
                selector: (student) => student.getCookies())
              ..load(),
            builder: (context, state) {
              return widget.content.href.startsWith("https://")
                  ? ResourceWebview(content: widget.content)
                  : LectioResourceView(
                      content: widget.content,
                    );
            }));
  }

  @override
  void dispose() {
    super.dispose();
  }
}
