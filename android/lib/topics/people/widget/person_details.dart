import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/context/student.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/calendar/bloc/schema_bloc.dart';
import 'package:betterlectio/topics/calendar/screens/schema.dart';
import 'package:betterlectio/topics/people/widget/avatar_dialog.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/utils/formatters.dart';

class PersonDetails extends StatefulWidget {
  const PersonDetails({super.key, this.person, this.entry});
  final Student? person;
  final MetaDataEntry? entry;
  @override
  State<PersonDetails> createState() => _PersonDetailsState();
}

class _PersonDetailsState extends State<PersonDetails> {
  ImageProvider? image;
  Student? student;
  void _getImage() {
    image = getStudentBloc(context)
        .state
        .student!
        .getImage(student!.imageId, fullsize: true);
    setState(() {});
  }

  Future<void> _initIds() async {
    if (widget.person != null) {
      student = widget.person;
    }
    if (widget.entry != null) {
      var blocStudent = getStudentBloc(context).state.student!;
      var studentContext = await blocStudent.context.get(widget.entry!.id);
      var studentCtx = studentContext as StudentContext;
      String info = "";
      int pS = widget.entry!.name.indexOf('(');
      int pE = widget.entry!.name.indexOf(')', pS);
      if (pS != -1 && pE != -1) {
        info = widget.entry!.name.substring(pS + 1, pE);
      }
      String normalizedId = studentCtx.id.replaceAll(RegExp("U|T|S"), "");
      student = Student(normalizedId, blocStudent.gymId)
        ..name = studentCtx.name
        ..imageId = studentCtx.imageId
        ..info = info;
    }
    _getImage();
  }

  @override
  void initState() {
    super.initState();
    _initIds();
  }

  

  @override
  void didUpdateWidget(covariant PersonDetails oldWidget) {
    super.didUpdateWidget(oldWidget);
    _initIds();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 48.0),
      child: SingleChildScrollView(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 12.0),
              child: GestureDetector(
                  onTap: () {
                    if (image != null) {
                      showDialog(
                        context: context,
                        builder: (context) {
                          return AvatarDialog(image: image!);
                        },
                      );
                    }
                  },
                  child: CircleAvatar(radius: 70.0, foregroundImage: image)),
            ),
            Padding(
              padding: const EdgeInsets.all(4.0),
              child: Text(
                student?.name ?? "",
                style: BlTypography.headlineSmall(context),
                textAlign: TextAlign.center,
              ),
            ),
            Text(student?.info ?? ""),
            if (widget.person != null)
              ListTile(
                onTap: () {
                  if (student != null) {
                    Navigator.push(
                        context,
                        adRoute(
                            SchemaScreen(
                                name: formatName(student?.name ?? ""),
                                bloc: SchemaBloc(
                                    student!, context.read<StudentBloc>())
                                  ..add(
                                    SwitchedDate(DateTime.now()),
                                  )),
                            onlyFromEdge: true));
                  }
                },
                title: Text("Se ${formatName(student?.name ?? "")} skema"),
                leading: const Icon(EvaIcons.calendarOutline),
              )
          ],
        ),
      ),
    );
  }
}
