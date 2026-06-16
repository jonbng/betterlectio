import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/rooms/room.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/topics/calendar/bloc/schema_bloc.dart';
import 'package:betterlectio/topics/calendar/screens/schema.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/utils/formatters.dart';

class RoomTile extends StatelessWidget {
  const RoomTile({super.key, required this.room, this.lokale = false});
  final Room room;
  final bool lokale;
  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () {
        var studentBloc = getStudentBloc(context);
        Navigator.push(
            context,
            adRoute(
                SchemaScreen(
                  room: true,
                  name: formatName(room.short),
                  bloc: SchemaBloc(studentBloc.state.student!, studentBloc,
                      room: room)
                    ..add(SwitchedDate(DateTime.now())),
                ),
                onlyFromEdge: true));
      },
      title: Text(room.short),
      subtitle: Text(lokale ? "Lokale" : room.name),
      trailing: !lokale ? InUseWidget(inUse: room.inUse) : null,
    );
  }
}

class InUseWidget extends StatelessWidget {
  const InUseWidget({super.key, required this.inUse});
  final bool inUse;
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(4.0),
        color: inUse ? Colors.red : Colors.green,
      ),
      height: 30.0,
      alignment: Alignment.center,
      width: 70.0,
      padding: const EdgeInsets.all(8.0),
      child: Text(
        (inUse ? "Optaget" : "Ledigt").toUpperCase(),
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
