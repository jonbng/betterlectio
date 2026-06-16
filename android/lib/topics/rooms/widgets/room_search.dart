import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/rooms/room.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/topics/rooms/widgets/room_tile.dart';
import 'package:betterlectio/topics/state/empty.dart';
import 'package:betterlectio/utils/helpers.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

class SearchRooms extends SearchDelegate<Room> {
  @override
  List<Widget>? buildActions(BuildContext context) {
    return [];
  }

  @override
  Widget? buildLeading(BuildContext context) {
    return null;
  }

  @override
  Widget buildResults(BuildContext context) {
    return Container();
  }

  @override
  Widget buildSuggestions(BuildContext context) {
    return StudentBlocBuilder<StudentCubit<List<Room>>, List<Room>?>(
      builder: (context, state) {
        if (state!.isEmpty) {
          return const EmptyScreen();
        }
        var matches = state
            .where((element) =>
                search(query, element.name) || search(query, element.short))
            .toList();
        return ListView.builder(
          itemCount: matches.length,
          itemBuilder: (context, index) {
            return RoomTile(room: matches[index]);
          },
        );
      },
    );
  }
}
