import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/rooms/room.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/rooms/widgets/room_search.dart';
import 'package:betterlectio/topics/rooms/widgets/room_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

class RoomOverview extends StatelessWidget {
  const RoomOverview({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          showSearch(context: context, delegate: SearchRooms());
        },
        child: const Icon(EvaIcons.searchOutline),
      ),
      appBar: const LppAppbar(
        title: "Lokaler",
        bottom: PreferredSize(
            preferredSize: Size.fromHeight(0.0), child: SizedBox()),
      ),
      body: StudentBlocBuilder<StudentCubit<List<Room>>, List<Room>?>(
        builder: (context, state) {
          if (state!.isEmpty) {
            return const EmptyScreen();
          }
          return ListView.builder(
            itemCount: state.length,
            itemBuilder: (context, index) {
              return RoomTile(room: state[index]);
            },
          );
        },
      ),
    );
  }
}
