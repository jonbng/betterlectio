import 'package:flutter/material.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/people/widget/person_details.dart';
import 'package:betterlectio/utils/ad_route.dart';

class PersonTile extends StatefulWidget {
  const PersonTile({super.key, required this.person});
  final Student person;

  @override
  State<PersonTile> createState() => _PersonTileState();
}

class _PersonTileState extends State<PersonTile> {
  late ImageProvider image;

  void _getImage() {
    image =
        getStudentBloc(context).state.student!.getImage(widget.person.imageId);
  }

  @override
  void initState() {
    super.initState();
    _getImage();
  }

  @override
  void didUpdateWidget(covariant PersonTile oldWidget) {
    super.didUpdateWidget(oldWidget);
    _getImage();
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        foregroundImage: image,
      ),
      title: Text(widget.person.name),
      subtitle: Text(widget.person.info ?? ""),
      onTap: () {
        adSheet(PersonDetails(person: widget.person), context);
      },
    );
  }
}
